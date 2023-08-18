

export type Session = {
    id: number
}

export type Offer = {
    from: number;
    offer: string;
    channel: string;
}

export type Answer = {
    from: number;
    answer: string,
}

export type Candidate = {
    candidate: RTCIceCandidate;
    sdpMid: string;
    sdpMLineIndex: number;
}
