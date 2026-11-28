// Vite's `?raw` imports: the file's text (step 35: the Inspector's markup).
declare module "*?raw" {
  const text: string;
  export default text;
}
