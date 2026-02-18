-- Enable RLS on junction tables (Security Advisor: RLS Disabled in Public)
-- These tables link systems, activities, deliverables to departments and purchase orders.

-- activity_purchase_orders
ALTER TABLE public.activity_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON public.activity_purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write for admins and managers" ON public.activity_purchase_orders FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('manager', 'admin', 'super_admin'))
);

-- activity_departments
ALTER TABLE public.activity_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON public.activity_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write for admins and managers" ON public.activity_departments FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('manager', 'admin', 'super_admin'))
);

-- deliverable_departments
ALTER TABLE public.deliverable_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON public.deliverable_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write for admins and managers" ON public.deliverable_departments FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('manager', 'admin', 'super_admin'))
);

-- deliverable_purchase_orders
ALTER TABLE public.deliverable_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON public.deliverable_purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write for admins and managers" ON public.deliverable_purchase_orders FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('manager', 'admin', 'super_admin'))
);

-- system_departments
ALTER TABLE public.system_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON public.system_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write for admins and managers" ON public.system_departments FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('manager', 'admin', 'super_admin'))
);

-- system_purchase_orders
ALTER TABLE public.system_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON public.system_purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write for admins and managers" ON public.system_purchase_orders FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('manager', 'admin', 'super_admin'))
);
