// Entry point for the roto-draft-room Worker.
//
// This Worker exists only to host the DraftRoom Durable Object class — Pages cannot
// define one itself, it can only bind to a class deployed here. Nothing routes to this
// Worker directly (workers_dev is off); traffic arrives through the Pages Function at
// functions/roto/api/[[path]].ts, which holds the binding.

export { DraftRoom } from "./room.js";

export default {
  fetch() {
    return new Response("This Worker only hosts the DraftRoom Durable Object.", {
      status: 404,
      headers: { "content-type": "text/plain" },
    });
  },
};
