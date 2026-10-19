import { useEffect, useState } from "react";

export type Route = "lab" | "compare" | "methodology";

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "compare" || h === "methodology") return h;
  return "lab";
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = (r: Route) => {
    window.location.hash = `/${r}`;
  };
  return [route, navigate];
}
