import { readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const root = process.cwd()
const output = path.join(root, "examples/react/src/.preview")

const verifyPng = async (name, expectedWidth, expectedHeight) => {
  const contents = await readFile(path.join(output, name))
  const width = contents.readUInt32BE(16)
  const height = contents.readUInt32BE(20)
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${name} is ${width}x${height}, expected ${expectedWidth}x${expectedHeight}`)
  }
}

const variants = [
  "locale=en,theme=light",
  "locale=en,theme=dark",
  "locale=zh,theme=light",
  "locale=zh,theme=dark"
]

await Promise.all(variants.flatMap((variant) => [
  verifyPng(`Card.${variant}.mobile.png`, 390, 844),
  verifyPng(`Card.${variant}.desktop.png`, 1440, 900)
]))

console.log("Verified example PNG artifacts.")
