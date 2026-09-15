import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => "blob:test-preview");
if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
window.scrollTo = vi.fn();
window.confirm = vi.fn(() => true);

afterEach(() => cleanup());
