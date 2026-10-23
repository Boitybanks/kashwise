import { useNavigate } from 'react-router-dom'
import { IdentityVerification } from '../components/IdentityVerification'
import { ButtonLink, PageHeader } from '../components/ui'

export default function IdentityDemo() {
  const navigate = useNavigate()
  return <div className="mx-auto max-w-lg">
    <PageHeader title="ID format & selfie demo" subtitle="Explore the experience. This is not an identity check." />
    <IdentityVerification onComplete={() => navigate('/discover')} />
    <div className="mt-4 text-center"><ButtonLink to="/discover" variant="ghost">Leave demo and browse work</ButtonLink></div>
  </div>
}
