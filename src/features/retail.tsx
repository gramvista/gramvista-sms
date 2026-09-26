import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ErrorBox, number } from "../components/ui";
export function RetailPurchase() {
  const client = useQueryClient();
  const pricing = useQuery({
    queryKey: ["pricing"],
    queryFn: () => api("pricing"),
  });
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [lastOrder, setLastOrder] = useState(() => sessionStorage.getItem("gramvista_clickpesa_order"));
  const [paymentStatus, setPaymentStatus] = useState("");
  const paymentMinimumUnits = pricing.data?.data.reduce((minimum: number, priceTier: any) => {
    const candidate = Math.max(
      Number(priceTier.min_units),
      Math.ceil(500 / Number(priceTier.price_per_unit)),
    );
    return candidate <= Number(priceTier.max_units)
      ? Math.min(minimum, candidate)
      : minimum;
  }, Number.POSITIVE_INFINITY) ?? 1;
  const tier = pricing.data?.data.find(
    (t: any) =>
      quantity >= Number(t.min_units) && quantity <= Number(t.max_units),
  );
  const valid = Number.isSafeInteger(quantity) && Boolean(tier) && quantity >= paymentMinimumUnits;
  useEffect(() => {
    if (!lastOrder) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const payment = await api("clickpesa-payment/" + lastOrder);
        if (stopped) return;
        if (payment.status === "verified") {
          setPaymentStatus("Payment confirmed. SMS credits have been added automatically.");
          await client.invalidateQueries({ queryKey: ["payments"] });
          await client.invalidateQueries({ queryKey: ["balance"] });
          return;
        }
        setPaymentStatus("Waiting for you to approve the mobile-money prompt...");
      } catch {
        // The manual status button remains available if a polling request fails.
      }
      if (!stopped) timer = setTimeout(check, 5000);
    };
    timer = setTimeout(check, 3000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [lastOrder, client]);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Buy SMS credits</h2>
          <p>
            Choose your quantity. The rate for that range applies to your entire
            purchase.
          </p>
        </div>
      </div>
      <ErrorBox error={pricing.error || error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SMS credits</th>
              <th>Price per credit</th>
            </tr>
          </thead>
          <tbody>
            {pricing.data?.data.map((t: any) => (
              <tr key={t.id}>
                <td>
                  {number(t.min_units)} to {number(t.max_units)}
                </td>
                <td>TSh {number(t.price_per_unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        style={{ padding: 24, maxWidth: 600 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const form = e.currentTarget;
          try {
            const checkout = await api("clickpesa-checkout", {
              method: "POST",
              body: {
                sms_units: quantity,
                customer_phone: new FormData(form).get("customer_phone"),
              },
            });
            await client.invalidateQueries({ queryKey: ["payments"] });
            sessionStorage.setItem("gramvista_clickpesa_order", checkout.id);
            setLastOrder(checkout.id);
            setPaymentStatus(
              "Payment request sent to your phone. Approve it with your mobile-money PIN, then check payment status.",
            );
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Number of SMS credits
          <input
            aria-label="Number of SMS credits"
            type="number"
            min={Number.isFinite(paymentMinimumUnits) ? paymentMinimumUnits : 1}
            max="1000000"
            step="1"
            required
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        {valid ? (
          <p>
            <strong>
              Total: TSh {number(quantity * Number(tier.price_per_unit))}
            </strong>{" "}
            at TSh {number(tier.price_per_unit)} per credit
          </p>
        ) : (
          <p>
            Mobile-money payments start at TSh 500. At the current rate, choose
            at least {Number.isFinite(paymentMinimumUnits) ? paymentMinimumUnits : 1} credits.
          </p>
        )}
        <p>
          One credit covers one SMS segment to one recipient. Long messages and
          Unicode text can use several credits; check the estimate before
          sending.
        </p>
        <label>
          Mobile-money number (255XXXXXXXXX)
          <input name="customer_phone" type="tel" pattern="255[0-9]{9}" required />
        </label>
        <button className="button" disabled={busy || !valid}>
          {busy ? "Sending payment request..." : "Pay by mobile money"}
        </button>
        <p>Credits appear after ClickPesa confirms the payment. Keep your order reference.</p>
        {lastOrder && (
          <div className="notice" role="status">
            <p>{paymentStatus || "Approve the payment prompt on your phone, then check its status."}</p>
            <button type="button" className="button" disabled={busy} onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const payment = await api("clickpesa-payment/" + lastOrder);
                setPaymentStatus(payment.status === "verified"
                  ? "Payment confirmed. SMS credits have been added."
                  : "Payment is pending. Check again shortly if you completed checkout.");
                await client.invalidateQueries({ queryKey: ["payments"] });
                await client.invalidateQueries({ queryKey: ["balance"] });
              } catch (err) { setError(err); }
              finally { setBusy(false); }
            }}>Check payment status</button>
          </div>
        )}
      </form>
    </section>
  );
}
