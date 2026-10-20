import { z } from "zod";

/** The rule for every staff password the Admin sets and every password a person chooses for themselves. (72 is the most the password hash keeps.) */
export const MIN_PASSWORD = 10;
export const passwordSchema = z.string().min(MIN_PASSWORD, `At least ${MIN_PASSWORD} characters`).max(72, "At most 72 characters");
