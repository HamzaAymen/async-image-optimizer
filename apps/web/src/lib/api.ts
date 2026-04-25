import ky, { HTTPError } from "ky";

export const api = ky.create({
  prefix: process.env.NEXT_PUBLIC_API_URL ?? "",
  hooks: {
    beforeError: [
      async ({ error }) => {
        if (!(error instanceof HTTPError)) return error;
        const body = (await error.response
          .clone()
          .json()
          .catch(() => null)) as { error?: string } | null;
        if (body?.error) error.message = body.error;
        return error;
      },
    ],
  },
});
