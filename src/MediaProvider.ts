import { deepMerge } from "./helper";

export class ConstraintHelper {
  public static withDimensions(
    w: number,
    h: number,
    force = false
  ): MediaTrackConstraints {
    return {
      width: {
        [force ? "exact" : "ideal"]: w,
      },
      height: {
        [force ? "exact" : "ideal"]: h,
      },
    };
  }

  public static withAspectRation(
    w: number,
    h: number,
    force = false
  ): MediaTrackConstraints {
    return {
      aspectRatio: {
        [force ? "exact" : "ideal"]: w / h,
      },
    };
  }

  public static forDevice(id: string, force = false): MediaTrackConstraints {
    return {
      deviceId: {
        [force ? "exact" : "ideal"]: id,
      },
    };
  }
}

export class UserMediaProvider {
  private _stream: MediaStream | undefined;
  private _constraints: MediaStreamConstraints;

  public constructor() {
    this._constraints = {
      audio: true,
      video: true,
    };
  }

  public get stream() {
    return this._stream;
  }

  /**
   * Request new user media with provided constraints
   *
   * this will create a new stream an override the current constraints
   *
   * @param constraints the MediaStreamConstraints
   * @returns a new stream
   */
  public async requestUserMedia(
    constraints?: MediaStreamConstraints
  ): Promise<MediaStream> {
    if (constraints) {
      this._constraints = constraints;
    }
    this._stream = await navigator.mediaDevices.getUserMedia(this._constraints);
    return this._stream;
  }

  /**
   * provide a partial constraints object which will be merged with the current constraints to create a new stream
   *
   * this will merge the new tracks into the current stream
   *
   * @param constraints
   */
  public async applyConstraints(
    constraints: Partial<MediaStreamConstraints>
  ): Promise<MediaStream> {
    this.mergeConstraints(constraints);
    if (!this._stream) return this.requestUserMedia(); // use the local (merged constraints)

    // remove old tracks
    const audioWasMuted = this._stream.getAudioTracks()[0]?.enabled;
    for (const track of this._stream?.getTracks()) {
      this._stream.removeTrack(track);
    }

    const newStream = await navigator.mediaDevices.getUserMedia(
      this._constraints
    );

    for (const track of newStream.getTracks()) {
      this._stream.addTrack(track);
    }
    this._stream.getAudioTracks().forEach((track) => {
      track.enabled = audioWasMuted;
    });
    return this._stream;
  }

  public mergeConstraints(constraints: Partial<MediaStreamConstraints>) {
    this._constraints.peerIdentity =
      constraints.peerIdentity || this._constraints.peerIdentity;
    this._constraints.preferCurrentTab =
      constraints.preferCurrentTab || this._constraints.preferCurrentTab;

    this._constraints.audio = this.mergeTrackConstraints(
      this._constraints.audio,
      constraints.audio
    );
    this._constraints.video = this.mergeTrackConstraints(
      this._constraints.video,
      constraints.video
    );
  }

  private mergeTrackConstraints(
    current: boolean | MediaTrackConstraints | undefined,
    other: boolean | MediaTrackConstraints | undefined
  ): boolean | MediaTrackConstraints | undefined {
    if (typeof other === "undefined") {
      return current;
    }

    if (
      typeof other === "boolean" ||
      typeof current === "boolean" ||
      typeof current === "undefined"
    ) {
      return other;
    }

    // deep merge options
    return deepMerge(current, other);
  }
}
