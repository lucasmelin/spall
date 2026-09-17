async function main(): Promise<number> {
  console.log("spall 0.0.1");
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`spall error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
