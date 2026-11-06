import { RepoForm } from "./components/repo-form";

export default function HomePage() {
  return (
    <main>
      <section className="pb-14 pt-6">
        <p className="font-mono text-xs tracking-[0.18em] text-stamp">CLEAN MACHINE PROOF</p>
        <h1 className="mt-3 max-w-3xl text-4xl leading-tight sm:text-6xl">
          Prove your AGENTS.md still installs on a clean machine.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-moss">
          Paste a public GitHub or GitLab URL. RunReady clones it into a fresh sandbox, reads the
          install, build, and verify commands in AGENTS.md, CLAUDE.md, or install.md, and writes an
          HTML pass/fail report with logs, exit codes, and a short suggested fix.
        </p>
        <p className="mt-4 font-mono text-xs text-moss">Free for every public repository. No account and no quota.</p>
        <div className="mt-8">
          <RepoForm />
        </div>
      </section>

      <section id="how" className="border-t border-line py-12">
        <h2 className="font-mono text-xs tracking-[0.18em] text-moss">HOW IT WORKS</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["01", "Paste", "A public https://github.com or https://gitlab.com repository URL. Private repos are out of scope."],
            ["02", "Sandbox", "A clean clone. Commands from the agent docs run with a timeout, a log cap, and network off after install."],
            ["03", "Proof", "A shareable page: pass or fail, the failing command, duration, exit code, and the log tail."],
          ].map(([number, title, copy]) => (
            <li key={number} className="ticket p-5">
              <p className="font-mono text-xs text-stamp">{number}</p>
              <h3 className="mt-2 text-2xl">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-moss">{copy}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
