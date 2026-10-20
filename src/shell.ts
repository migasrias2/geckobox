/** Quote one argument for a POSIX shell. */
export function quote(arg: string): string {
  if (arg === "") return "''"
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

/** Join argv into one safely quoted shell line. */
export function join(argv: readonly string[]): string {
  return argv.map(quote).join(" ")
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function isEnvName(name: string): boolean {
  return ENV_NAME.test(name)
}

/** `export K='v'` lines for the given variables (skips unset ones). */
export function exportLines(env: Readonly<Record<string, string | undefined>>): string {
  return Object.entries(env)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => {
      if (!isEnvName(key)) throw new Error(`Invalid environment variable name: ${key}`)
      return `export ${key}=${quote(value)}`
    })
    .join("\n")
}
