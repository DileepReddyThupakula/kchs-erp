import { configure } from "@testing-library/react";

// The screen tests run at the same time as headless-browser PDF checks, so a busy machine can make a screen answer late.
// A render loop (the failure this suite guards against) still fails, only after a few seconds instead of one.
configure({ asyncUtilTimeout: 4000 });
