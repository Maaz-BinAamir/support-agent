import { describe, expect, test } from "bun:test";
import {
  getCitationNumbers,
  hasValidCitationMarkers,
  removeCitationMarkers,
} from "../src/lib/citations.ts";

describe("citation markers", () => {
  test("accepts the bracket style returned by Groq", () => {
    const answer =
      "Create the Worker in the dashboard【1】, then deploy it with Wrangler【3】.";

    expect(getCitationNumbers(answer)).toEqual([1, 3]);
    expect(hasValidCitationMarkers(answer, 4)).toBe(true);
    expect(removeCitationMarkers(answer)).toBe(
      "Create the Worker in the dashboard, then deploy it with Wrangler.",
    );
  });

  test("continues to accept ASCII markers", () => {
    const answer = "Run `npx wrangler deploy` [2].";

    expect(getCitationNumbers(answer)).toEqual([2]);
    expect(hasValidCitationMarkers(answer, 2)).toBe(true);
  });

  test("rejects missing and out-of-range markers", () => {
    expect(hasValidCitationMarkers("Run `npx wrangler deploy`.", 2)).toBe(
      false,
    );
    expect(hasValidCitationMarkers("Run `npx wrangler deploy`【3】.", 2)).toBe(
      false,
    );
  });
});
