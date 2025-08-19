// Minimal test stub for nanoid's customAlphabet.
// Good enough for deterministic tests; NOT for production cryptographic use.
function customAlphabet(alphabet, size = 21) {
  return () => {
    let out = "";
    for (let i = 0; i < size; i++) {
      const idx = Math.floor(Math.random() * alphabet.length);
      out += alphabet[idx];
    }
    return out;
  };
}

module.exports = { customAlphabet };
