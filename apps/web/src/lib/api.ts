import ky, { HTTPError } from "ky";

export const api = ky.create({
  prefix: process.env.NEXT_PUBLIC_API_URL ?? "",
  timeout: 30_000,
  hooks: {
    beforeError: [
      ({ error }) => {
        if (!(error instanceof HTTPError)) return error;
        const data = error.data as { error?: string } | undefined;
        if (data?.error) error.message = data.error;
        return error;
      },
    ],
  },
});
