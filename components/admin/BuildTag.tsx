// Small "build <commit> · <time>" label in the bottom-right corner so it's obvious
// which version a given server is actually running. The id is baked in at build
// time (NEXT_PUBLIC_BUILD_ID, see Dockerfile / build.sh) — "dev" when run locally.
export default function BuildTag() {
  const raw = process.env.NEXT_PUBLIC_BUILD_ID || 'dev'
  const [sha, when] = raw.split('|')
  return (
    <div className="fixed bottom-1.5 right-2 z-40 text-[10px] leading-none text-gray-400 bg-white/70 rounded px-1.5 py-1 select-text"
      title={`Build ${raw.replace('|', ' built ')}`}>
      build {sha}{when ? ` · ${when}` : ''}
    </div>
  )
}
