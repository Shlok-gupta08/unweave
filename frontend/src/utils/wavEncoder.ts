/**
 * Converts an AudioBuffer into a 16-bit PCM WAV Blob.
 * Supports mono and stereo at any sample rate.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    // Interleave channels
    const length = buffer.length;
    const bufferSize = 44 + length * blockAlign;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // Write WAV header
    // "RIFF" chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length * blockAlign, true);
    writeString(view, 8, 'WAVE');

    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, format, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, bitDepth, true); // BitsPerSample

    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, length * blockAlign, true); // Subchunk2Size

    // Write interleaved 16-bit PCM samples
    let offset = 44;
    const channelData: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
        channelData.push(buffer.getChannelData(c));
    }

    for (let i = 0; i < length; i++) {
        for (let c = 0; c < numChannels; c++) {
            const sample = Math.max(-1, Math.min(1, channelData[c][i]));
            // Scale to 16-bit signed integer [-32768, 32767]
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, intSample, true);
            offset += 2;
        }
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
