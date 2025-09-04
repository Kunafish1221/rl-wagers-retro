'use client'

export default function TestUpload() {
  return (
    <form
      action="/api/users/YOUR_REAL_USER_ID/pfp"
      method="post"
      encType="multipart/form-data"
      className="p-6 space-y-4"
    >
      <input type="file" name="file" className="block" />
      <button
        type="submit"
        className="rounded bg-rl-neon px-4 py-2 font-bold text-black"
      >
        Upload
      </button>
    </form>
  )
}