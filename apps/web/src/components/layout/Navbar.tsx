'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Ticket, Calendar, ShoppingBag, User, LogOut, Menu, X } from 'lucide-react';
import { getMe, type AuthUser } from '@/lib/api';

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const currentUser = await getMe();
        setUser(currentUser);
      } catch (err) {
        console.error('Failed to get session user', err);
      }
    })();
  }, [pathname]);

  const navItems = [
    { name: 'Events', href: '/events', icon: Calendar },
    { name: 'Marketplace', href: '/marketplace', icon: ShoppingBag },
    { name: 'My Tickets', href: '/tickets', icon: Ticket },
    ...(user ? [{ name: 'Profile', href: '/profile', icon: User }] : []),
  ];

  const isActive = (href: string) =>
    href === '/events' ? pathname === '/' || pathname.startsWith('/events') : pathname.startsWith(href);
  const isLoginPage = pathname === '/login';

  return (
    <nav className="bg-white border-b border-zinc-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/events" className="flex items-center space-x-2">
              <span className="h-8 w-8 bg-zinc-900 rounded flex items-center justify-center text-white font-bold text-sm">
                TC
              </span>
              <span className="font-mono font-bold tracking-tight text-lg text-zinc-900">
                TICKETCHAIN
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}

            {/* Profile or Login */}
            <div className="border-l border-zinc-200 h-6 mx-2" />

            {user ? (
              <div className="flex items-center space-x-3">
                <span className="text-xs font-mono text-zinc-500 max-w-[140px] truncate hidden lg:inline">
                  {user.email}
                </span>

                {/* Dashboard Shortcuts based on roles */}
                {user.role >= 2 && user.role !== 99 && ( // Organisation Admin or Super Admin
                  <Link
                    href="/admin"
                    className="text-xs font-mono uppercase bg-zinc-900 hover:bg-zinc-800 text-white px-2.5 py-1 rounded transition-colors"
                  >
                    Org Admin
                  </Link>
                )}
                {user.role === 99 && ( // Platform Admin
                  <Link
                    href="/platform"
                    className="text-xs font-mono uppercase bg-zinc-900 hover:bg-zinc-800 text-white px-2.5 py-1 rounded transition-colors"
                  >
                    Platform
                  </Link>
                )}
                {user.role === 1 && ( // Volunteer
                  <Link
                    href="/checkin"
                    className="text-xs font-mono uppercase bg-zinc-900 hover:bg-zinc-800 text-white px-2.5 py-1 rounded transition-colors"
                  >
                    Scanner PWA
                  </Link>
                )}
              </div>
            ) : !isLoginPage ? (
              <Link
                href="/login"
                className="flex items-center space-x-1 px-4 py-1.5 rounded border border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white text-sm font-medium transition-colors"
              >
                <span>Sign In</span>
              </Link>
            ) : null}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-zinc-500 hover:text-zinc-900 p-2 focus:outline-none"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden border-t border-zinc-200 bg-white px-2 pt-2 pb-3 space-y-1"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium ${
                  active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}

          <div className="border-t border-zinc-200 my-2 pt-2" />

          {user ? (
            <div className="space-y-1">
              <p className="px-3 py-1 text-[10px] font-mono text-zinc-400 truncate">{user.email}</p>
              {user.role >= 2 && user.role !== 99 && (
                <Link
                  href="/admin"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                >
                  <span>Org Admin Panel</span>
                </Link>
              )}
              {user.role === 99 && (
                <Link
                  href="/platform"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                >
                  <span>Platform Dashboard</span>
                </Link>
              )}
            </div>
          ) : !isLoginPage ? (
            <Link
              href="/login"
              onClick={() => setIsOpen(false)}
              className="block text-center w-full px-4 py-2 mt-2 rounded border border-zinc-900 text-zinc-900 font-medium text-sm hover:bg-zinc-900 hover:text-white transition-colors"
            >
              Sign In
            </Link>
          ) : null}
        </motion.div>
      )}
    </nav>
  );
}
