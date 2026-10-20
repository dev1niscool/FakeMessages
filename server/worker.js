import { handleNativeRequest } from './native-renderer.mjs';

// This fixed-route module can also be hosted independently of the current
// companion Site. It contains no shared upstream session or service credential.
export default {
  fetch(request) {
    return handleNativeRequest(request);
  },
};
