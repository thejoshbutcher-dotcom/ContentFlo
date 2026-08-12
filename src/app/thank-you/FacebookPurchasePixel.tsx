"use client";

import Script from "next/script";

/**
 * Meta pixel, loaded only on the thank-you page and only for a purchase the
 * server already confirmed with Stripe.
 *
 * `eventID` is the Stripe checkout session id, so a refresh or a back-button
 * revisit is deduplicated by Meta instead of counting as a second sale. That
 * same id is what a future Conversions API call would send to pair with this
 * browser event.
 */
export default function FacebookPurchasePixel({
  pixelId,
  eventId,
  value,
  currency,
}: {
  pixelId: string;
  eventId: string;
  value?: number;
  currency?: string;
}) {
  const purchase = JSON.stringify(
    value ? { value, currency: currency ?? "USD" } : {}
  );

  return (
    <Script id="fb-purchase" strategy="afterInteractive">
      {`
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(pixelId)});
fbq('track', 'PageView');
fbq('track', 'Purchase', ${purchase}, { eventID: ${JSON.stringify(eventId)} });
      `}
    </Script>
  );
}
