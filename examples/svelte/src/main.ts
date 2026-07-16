import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (target === null) {
  throw new Error("The Svelte example root element is missing.");
}

mount(App, { target });
