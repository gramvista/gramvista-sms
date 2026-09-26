-- Extend the existing first tier without changing its price or historical orders.
update sms_price_tiers set min_units=1 where min_units=1001 and max_units=29999;
