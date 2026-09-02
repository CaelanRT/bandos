export function AppShell({ children }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header>
        <nav aria-label="Primary">
          <a href="/">Bandos</a>
        </nav>
      </header>
      <main id="main-content" tabIndex="-1">
        {children}
      </main>
    </>
  )
}
