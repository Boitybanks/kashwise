import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { removeProfilePhoto, setProfilePhoto } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import { avatarUrl } from '../../lib/supabase'
import type { Profile } from '../../lib/types'
import { validatePhotoFile } from '../../lib/validation'
import { Avatar, Button, Card } from '../ui'
import { useToast } from '../ui/toast'

export function ProfilePhoto({ profile, readOnly, onChanged }: { profile: Profile; readOnly: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function run(task: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await task()
      await onChanged()
      toast.show(done)
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  function onPick(file: File | undefined) {
    if (!file) return
    const problem = validatePhotoFile(file)
    if (problem) return toast.show(problem, 'error')
    void run(() => setProfilePhoto(profile.id, file, profile.avatar_path), 'Profile photo updated.')
  }

  return (
    <Card className="mb-5 flex items-center gap-4 p-5">
      <Avatar name={profile.display_name} id={profile.id} src={avatarUrl(profile.avatar_path)} size="xl" />
      <div className="min-w-0 flex-1">
        <h2 className="font-bold">Profile photo</h2>
        <p className="text-sm text-muted">
          A clear photo of your face helps {profile.role === 'worker' ? 'customers' : 'workers'} recognise you when you meet. It’s cropped to a
          square and location data is removed.
        </p>
        {!readOnly && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
              <Camera className="size-4" aria-hidden /> {profile.avatar_path ? 'Change photo' : 'Add photo'}
            </Button>
            {profile.avatar_path && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => removeProfilePhoto(profile.id, profile.avatar_path!), 'Profile photo removed.')}>
                Remove
              </Button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a profile photo"
              onChange={(e) => {
                onPick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
        )}
      </div>
    </Card>
  )
}
