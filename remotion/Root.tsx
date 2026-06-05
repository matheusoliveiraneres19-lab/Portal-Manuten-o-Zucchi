import { Composition } from "remotion";
import { PortalDemo } from "./Demo";

export function RemotionRoot() {
  return (
    <Composition
      id="PortalDemo"
      component={PortalDemo}
      durationInFrames={1350}
      fps={30}
      width={1920}
      height={1080}
    />
  );
}
