import { useScopedResource } from "./resource-hooks.tsx";

export function ResourceConsumer({ name = "checkout" }) {
  const resource = useScopedResource(name);
  return <div>{resource}</div>;
}
