export async function run(save: () => Promise<void>): Promise<void> {
  try {
    await save();
  } catch (e) {
  }
}
