import Alpine from 'alpinejs/dist/module.esm'

import './theme'
import { Answer, Candidate, Offer, Session } from './types'
import { sendEvent } from './helper'

type State = {
    mode: 'loading' | 'join' | 'active'
    error?: string
    availableRooms: number[]
    myId?: number
    roomId?: number
    audioDevices: MediaDeviceInfo[]
    videoDevices: MediaDeviceInfo[]
    muted: boolean
    constraints: Record<string, any>
}

const constraints = {
    'qvga': {
        video: { width: { exact: 320 }, height: { exact: 240 } }
    },
    'vga': {
        video: { width: { exact: 640 }, height: { exact: 480 } }
    },
    'hd': {
        video: { width: { exact: 1280 }, height: { exact: 720 } }
    },
    'fullHd': {
        video: { width: { exact: 1920 }, height: { exact: 1080 } }
    }
}

class SenderController {
    private events: EventSource;
    private state: State
    private pc: RTCPeerConnection
    private channel: RTCDataChannel
    private stream: MediaStream

    constructor() {
        Alpine.store('sender', {
            mode: 'loading',
            errror: undefined,
            myId: undefined,
            roomId: undefined,
            audioDevices: [],
            videoDevices: [],
            constraints,
            join: (rid: string) => this.join(rid),
            leave: () => this.leave(),
            changeAudio: (id: string) => this.chageAudio(id),
            changeVideo: (id: string) => this.changeVideo(id),
            toggleMute: () => this.toggleMute(),
            applyResolution: (id: string) => this.applyResolution(id)
        })
        this.state = Alpine.store('sender') as State

        fetch('/api/register').then(r => r.json()).then(session => {
            this.state.myId = (session as Session).id
            this.events = new EventSource('/api/events', {
                withCredentials: true
            })
            this.events.addEventListener("message", console.log)
            this.events.addEventListener("candidate", async e => this.handleCandidate(JSON.parse(e.data) as Candidate))
            this.events.addEventListener("answer", e => this.handleAnswer(JSON.parse(e.data) as Answer))

            fetch('api/list').then(r => r.json()).then(list => {
                this.state.availableRooms = list.list.filter(id => id !== this.state.myId)
                this.state.mode = 'join'
            })
        })
    }

    private async handleAnswer(answer: Answer) {
        console.log('got answer:', {
            type: 'answer',
            sdp: answer.answer
        })
        this.pc.setRemoteDescription({
            type: 'answer',
            sdp: answer.answer
        })
    }

    public async join(roomId: string) {
        await this.setupStream()
        this.state.roomId = parseInt(roomId)
        if (this.pc) {
            this.pc.close();
        }

        this.pc = new RTCPeerConnection()
        for (const track of this.stream.getTracks()) {
            const sender = await this.pc.addTrack(track, this.stream)
            console.log(track)
        }
        this.pc.onicecandidate = async e => {
            await sendEvent(this.state.roomId ?? 0, this.state.myId ?? 0, 'candidate', JSON.stringify({
                candidate: e.candidate,
                sdpMid: e.candidate?.sdpMid,
                sdpMLineIndex: e.candidate?.sdpMLineIndex,
            } as Candidate))
        }
        this.pc.onconnectionstatechange = e => {
            if (this.pc.connectionState === 'connected') {
                this.state.mode = 'active'
                this.handleConnected();
            }
            else if (this.pc.connectionState === 'disconnected') {
                this.state.mode = 'active'
                this.leave()
            }
        }
        const channel = this.pc.createDataChannel("main")
        this.channel = channel;
        channel.onopen = () => console.log('channel opened')
        channel.onmessage = e => console.log()
        channel.onclose = console.log

        const offer = await this.pc.createOffer()
        console.log('creating offer:', offer)
        await this.pc.setLocalDescription(offer)
        await sendEvent(this.state.roomId ?? 0, this.state.myId ?? 0, 'offer', JSON.stringify({
            from: this.state.myId ?? 0,
            offer: offer.sdp,
            channel: 'main'
        } as Offer))
    }

    private async handleCandidate(candidate: Candidate) {
        console.log('got remote ice candidate', candidate.candidate)
        if (!candidate.candidate) {
            await this.pc.addIceCandidate(undefined)
        } else {
            await this.pc.addIceCandidate(candidate.candidate)
        }
    }

    public async leave() {
        if (this.pc) {
            this.pc.close()
            this.stream.getTracks().forEach(t => t.stop())
        }
        window.location.href = "/"
    }

    private async setupStream() {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    }

    private async handleConnected() {
        console.log('connected')

        const vid = document.getElementById('localVideo') as HTMLVideoElement
        vid.srcObject = this.stream;

        const devices = await navigator.mediaDevices.enumerateDevices()
        this.state.audioDevices = devices.filter(d => d.kind === 'audioinput')
        this.state.videoDevices = devices.filter(d => d.kind === 'videoinput')
    }

    public async chageAudio(id: string) {
        const video = this.stream.getVideoTracks()[0]
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { ideal: id } },
            video: { deviceId: { ideal: video.id } }
        })
        this.stream.removeTrack(this.stream.getAudioTracks()[0])
        const newAudio = stream.getAudioTracks()[0]
        const audioSender = this.pc.getSenders().filter(sender => sender.track?.kind === 'audio')[0]
        audioSender.replaceTrack(newAudio)
        this.stream.addTrack(newAudio)
    }

    public async changeVideo(id: string) {
        const audio = this.stream.getAudioTracks()[0]
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { ideal: audio.id } },
            video: { deviceId: { ideal: id } }
        })
        this.stream.removeTrack(this.stream.getVideoTracks()[0])
        const newVideo = stream.getVideoTracks()[0]
        const videoSender = this.pc.getSenders().filter(sender => sender.track?.kind === 'video')[0]
        videoSender.replaceTrack(newVideo)
        this.stream.addTrack(newVideo)
    }

    public async toggleMute() {
        this.state.muted = !this.state.muted
        this.stream.getAudioTracks().forEach(track => {
            track.enabled = !this.state.muted
        })
    }

    public async applyResolution(named: string) {
        const c = constraints[named]
        const audio = this.stream.getAudioTracks()[0]
        const video = this.stream.getVideoTracks()[0]
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { ideal: audio.id } },
            video: c?.video || {
                deviceId: { idel: video.id }
            }
        })
        this.stream.removeTrack(this.stream.getVideoTracks()[0])
        const newVideo = stream.getVideoTracks()[0]
        const videoSender = this.pc.getSenders().filter(sender => sender.track?.kind === 'video')[0]
        videoSender.replaceTrack(newVideo)
        this.stream.addTrack(newVideo)
    }

}

document.addEventListener("visibilitychange", function logData() {
    if (document.visibilityState === "hidden") {
        navigator.sendBeacon("/api/unregister");
    }
});


export const controller = new SenderController()

Alpine.start()