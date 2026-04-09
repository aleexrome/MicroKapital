import { PlexusBackground } from '@/components/ui/PlexusBackground'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      {/* Animated plexus background */}
      <PlexusBackground />

      {/* Login card — sits above canvas */}
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>
    </div>
  )
}
