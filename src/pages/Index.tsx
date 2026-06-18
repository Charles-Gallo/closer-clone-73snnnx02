import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Loader2 } from 'lucide-react'

export default function Index() {
  const { user, profile, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading) {
      if (user) {
        if (profile?.role === 'agency') {
          navigate('/agency', { replace: true })
        } else {
          navigate('/app', { replace: true })
        }
      } else {
        navigate('/auth', { replace: true })
      }
    }
  }, [user, profile, loading, navigate])

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
}
