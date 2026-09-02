// heic-convert ships no types — minimal ambient declaration for our usage.
declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer | Uint8Array
    format: 'JPEG' | 'PNG'
    quality?: number
  }
  function convert(opts: HeicConvertOptions): Promise<ArrayBuffer>
  export default convert
}
