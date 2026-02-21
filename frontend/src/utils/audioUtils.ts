declare const lamejs: any;

/**
 * Downloads audio data from a given url (such as /stems/...) into an ArrayBuffer.
 */
async function fetchAudioBuffer(url: string, audioContext: AudioContext | OfflineAudioContext): Promise<AudioBuffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Merges multiple audio URLs asynchronously using an OfflineAudioContext.
 * Returns an AudioBuffer containing the mixed audio.
 */
export async function mergeStemsToBuffer(urls: string[]): Promise<AudioBuffer> {
    const tempContext = new window.AudioContext();

    // Decode all buffers
    const buffers = await Promise.all(urls.map(url => fetchAudioBuffer(url, tempContext)));
    tempContext.close();

    if (buffers.length === 0) {
        throw new Error("No buffers to merge.");
    }

    // Determine target offline context dimensions (use the longest buffer's length)
    // Assume all buffers have the same sample rate (standard 44100 or 48000)
    let maxLen = 0;
    const sampleRate = buffers[0].sampleRate;
    const numberOfChannels = buffers[0].numberOfChannels;

    for (const b of buffers) {
        if (b.length > maxLen) {
            maxLen = b.length;
        }
    }

    const offlineContext = new OfflineAudioContext(numberOfChannels, maxLen, sampleRate);

    // Copy all buffers into the offline context
    for (const buffer of buffers) {
        const source = offlineContext.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineContext.destination);
        source.start(0);
    }

    // Render the mix
    return await offlineContext.startRendering();
}

/**
 * Converts an AudioBuffer into an MP3 Blob using lamejs.
 * Note: Only supports 1 or 2 channels. 
 */
export function audioBufferToMP3Blob(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    // Standard mp3 encoder settings
    const kbps = 192;
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);

    // We need to pass data as Int16Array to lamejs
    // Extract Float32 array and convert to Int16
    const leftFloat = buffer.getChannelData(0);
    const rightFloat = numChannels > 1 ? buffer.getChannelData(1) : undefined;

    const sampleBlockSize = 1152; // Needs to be a multiple of 576
    const mp3Data: Int8Array[] = [];

    const leftInt16 = new Int16Array(leftFloat.length);
    for (let i = 0; i < leftFloat.length; i++) {
        // Clamp and map float to int16
        const s = leftFloat[i];
        leftInt16[i] = s < 0 ? s * 32768 : s * 32767;
    }

    let rightInt16: Int16Array | undefined = undefined;
    if (rightFloat) {
        rightInt16 = new Int16Array(rightFloat.length);
        for (let i = 0; i < rightFloat.length; i++) {
            const s = rightFloat[i];
            rightInt16[i] = s < 0 ? s * 32768 : s * 32767;
        }
    }

    for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
        const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
        let mp3buf;
        if (numChannels === 2 && rightInt16) {
            const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
            mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        } else {
            mp3buf = mp3encoder.encodeBuffer(leftChunk);
        }

        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data as unknown as BlobPart[], { type: 'audio/mpeg' });
}
