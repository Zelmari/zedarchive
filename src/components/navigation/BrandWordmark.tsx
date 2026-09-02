import Link from 'next/link';
import Image from 'next/image';

interface BrandWordmarkProps {
  href?: string;
  className?: string;
  subline?: string;
}

export default function BrandWordmark({
  href = '/',
  className = '',
  subline = 'quiet media archive',
}: BrandWordmarkProps) {
  return (
    <Link href={href} className={`za-wordmark za-link za-site-header__brand ${className}`.trim()}>
      <Image
        alt=""
        aria-hidden="true"
        className="za-wordmark__mark"
        height={36}
        src="/transparentlogo.png"
        width={36}
        unoptimized
      />
      <span className="za-wordmark__lockup">
        <span className="za-wordmark__text">zedarchive</span>
        {subline && <span className="za-wordmark__subline">{subline}</span>}
      </span>
    </Link>
  );
}
