/**
 * All resource identifiers received from the API are strings. This prevents
 * MySQL BIGINT UNSIGNED values from losing precision in JavaScript.
 */
export type UserId = string;

/** Information that may be shown to any visitor. */
export type PublicUser = {
  id: UserId;
  nickname: string;
  avatarUrl: string | null;
};

/** Information returned only for the currently authenticated account. */
export type CurrentUser = PublicUser & {
  loginName: string;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
};
