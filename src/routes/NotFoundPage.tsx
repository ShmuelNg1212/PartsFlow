import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-heading text-3xl">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">The link may be old or mistyped.</p>
      <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
        Go to the overview
      </Link>
    </div>
  )
}
