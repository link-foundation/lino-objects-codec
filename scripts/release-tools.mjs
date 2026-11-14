/** Load the shared, lockfile-managed release tools only when invoked. */
export async function loadReleaseTools(
  { configuration = true } = {},
  importModule = (name) => import(name),
) {
  const { $ } = await importModule("command-stream");
  return configuration ? { $, ...(await importModule("lino-arguments")) } : { $ };
}
