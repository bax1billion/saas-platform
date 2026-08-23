import { defineAuth } from '@aws-amplify/backend';
import { postConfirmation } from './post-confirmation/resource';
import { GROUPS } from '../shared/constants';

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: [...GROUPS],
  triggers: {
    postConfirmation,
  },
});
