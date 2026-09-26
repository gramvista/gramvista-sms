// No unauthenticated payload may change delivery or billing state until the
// provider's callback authentication and payload contract are documented.
Deno.serve(() =>
  Response.json(
    {
      accepted: false,
      reason:
        "Callback integration pending provider documentation. Delivery is reconciled through the authenticated report API.",
    },
    { status: 501 },
  ),
);
