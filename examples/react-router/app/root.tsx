import { TooltipProvider } from "~/components/ui/tooltip";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "./app.css";

export const Layout = ({ children }: { readonly children: ReactNode }) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta
        content="A repeatable issue workspace that shows how UI previews support agent development."
        name="description"
      />
      <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      <title>Preview Lab</title>
      <Meta />
      <Links />
    </head>
    <body>
      {children}
      <ScrollRestoration />
      <Scripts />
    </body>
  </html>
);

const App = () => (
  <TooltipProvider>
    <Outlet />
  </TooltipProvider>
);

export default App;
