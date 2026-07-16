import { createApp } from "vue";
import App from "./App.vue";

const root = document.getElementById("app");
if (root === null) {
  throw new Error("The Vue example root element is missing.");
}

createApp(App).mount(root);
