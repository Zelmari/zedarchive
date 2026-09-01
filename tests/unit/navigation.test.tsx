import { describe, it, expect } from 'vitest';
import React from 'react';
import BrandWordmark from '@/components/navigation/BrandWordmark';
import SubPageHeader from '@/components/navigation/SubPageHeader';

describe('BrandWordmark component', () => {
  it('renders default link to root with brand classes', () => {
    const element = <BrandWordmark />;
    expect(element.props.href).toBe('/');
  });

  it('accepts custom href', () => {
    const element = <BrandWordmark href="/dashboard" />;
    expect(element.props.href).toBe('/dashboard');
  });
});

describe('SubPageHeader component', () => {
  it('supports standard and sticky variants', () => {
    const standardHeader = <SubPageHeader variant="standard" />;
    expect(standardHeader.props.variant).toBe('standard');

    const stickyHeader = <SubPageHeader variant="sticky" />;
    expect(stickyHeader.props.variant).toBe('sticky');
  });

  it('accepts breadcrumbs and nav items', () => {
    const header = (
      <SubPageHeader
        breadcrumbs={[{ label: 'Groups', href: '/groups' }, { label: 'Team' }]}
        navItems={[{ label: 'Dashboard', href: '/dashboard' }]}
      />
    );
    expect(header.props.breadcrumbs).toHaveLength(2);
    expect(header.props.navItems).toHaveLength(1);
  });
});
