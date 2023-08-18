import Alpine from 'alpinejs/dist/module.esm'

import './theme'
import { Answer, Candidate, Offer, Session } from './types'
import { sendEvent } from './helper'


type State = {
    mode: 'loading' | 'active'
    error?: string
    myId?: number
}

class ReceiverController {
    private events?: EventSource
    private state: State;
    private pc: RTCPeerConnection
    private channel: Record<string, RTCDataChannel> = {}
    private remoteStream: MediaStream

    constructor() {
        Alpine.store('receiver', {
            mode: 'laoding',
            error: undefined,
            myId: undefined,
            leave: () => this.leave()
        })
        this.state = Alpine.store('receiver') as State

        fetch('/api/register').then(r => r.json()).then(session => {
            this.state.myId = (session as Session).id
            this.events = new EventSource('/api/events', {
                withCredentials: true
            })
            this.events.addEventListener("message", console.log)
            this.events.addEventListener("candidate", async e => this.handleCandidate(JSON.parse(e.data) as Candidate))
            this.events.addEventListener("offer", async e => this.handleOffer(JSON.parse(e.data) as Offer))
            this.state.mode = 'active'
        })
    }

    private async handleOffer(offer: Offer) {
        console.log('got offer', { type: 'offer', sdp: offer.offer })
        if (!this.pc) {
            this.pc = new RTCPeerConnection();
        }
        this.pc.onicecandidate = async e => {
            console.log('got ice candidate', e.candidate)
            await sendEvent(offer.from, this.state.myId ?? 0, 'candidate', JSON.stringify({
                candidate: e.candidate,
                sdpMid: e.candidate?.sdpMid,
                sdpMLineIndex: e.candidate?.sdpMLineIndex,
            } as Candidate))
        }
        this.pc.ondatachannel = e => {
            this.channel[e.channel.label] = e.channel
            if (e.channel.label === offer.channel) {
                e.channel.onopen = console.log
                e.channel.onmessage = console.log
                e.channel.onclose = console.log
            }

        }
        this.pc.onconnectionstatechange = e => {
            if (this.pc.connectionState === 'connected') {
                console.log('connected')
                const vid = document.getElementById('remoteVideo') as HTMLVideoElement
                vid.srcObject = this.remoteStream // new MediaStream(this.remoteTracks)
            }
        }
        this.pc.ontrack = e => this.handleTrack(e)

        this.pc.setRemoteDescription({
            type: 'offer',
            sdp: offer.offer
        })
        const answer = await this.pc.createAnswer()
        console.log('sending answer', answer)
        await sendEvent(offer.from, this.state.myId ?? 0, 'answer', JSON.stringify({
            from: this.state.myId ?? 0,
            answer: answer.sdp
        } as Answer))
        this.pc.setLocalDescription(answer)
    }

    private async handleCandidate(candidate: Candidate) {
        console.log('got remote ice candidate', candidate.candidate)
        if (!candidate.candidate) {
            await this.pc.addIceCandidate(undefined)
        } else {
            await this.pc.addIceCandidate(candidate.candidate)
        }
    }

    async leave() {
        if (this.pc) {
            this.pc.close()
            this.remoteStream.getTracks().forEach(t => t.stop())
        }
        window.location.href = "/"
    }

    private handleTrack(t: RTCTrackEvent) {
        console.log('got track', t.streams[0].id, t)
        this.remoteStream = t.streams[0]
    }
}

document.addEventListener("visibilitychange", function logData() {
    if (document.visibilityState === "hidden") {
        navigator.sendBeacon("/api/unregister");
    }
});

export const controller = new ReceiverController();

Alpine.start()