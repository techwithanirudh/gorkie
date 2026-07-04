export interface UserProfile {
  displayName?: string;
  fields: { label: string; value: string }[];
  pronouns?: string;
  realName?: string;
  status?: string;
  timezone?: string;
  timezoneLabel?: string;
  title?: string;
}
