export const jobs = [];

export async function good(read: () => Promise<string>): Promise<string> {
  try {
    return await read();
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function bad(read: () => Promise<string>): Promise<string> {
  try {
    return await read();
  } catch (error) {
  }
  return '';
}
