// `import css from "x.css?inline"`: the stylesheet's text (Vite).
declare module "*.css?inline" {
  const css: string;
  export default css;
}
