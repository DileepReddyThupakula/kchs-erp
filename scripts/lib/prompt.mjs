// Typing on the keyboard in a Terminal: a visible answer, or a hidden one (a password). Nothing here ever prints what was typed.
import readline from "node:readline";

export async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await new Promise((r) => rl.question(question, r));
  rl.close();
  return a.trim();
}

export async function askHidden(question) {
  if (!process.stdin.isTTY) throw new Error("A password has to be typed in an interactive Terminal.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (t) => { if (t.includes(question)) process.stdout.write(t); };   // hide what is typed
  const a = await new Promise((r) => rl.question(question, r));
  rl.close();
  process.stdout.write("\n");
  return a;
}
