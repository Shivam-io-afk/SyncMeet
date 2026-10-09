import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, LogIn, ChevronDown } from 'lucide-react';
import { ThemeToggle } from '../common/ThemeToggle';

export function UserMenu({
  user,
  onOpenAuth,
  onOpenProfile,
  onSignOut,
  canEditProfile = true,
  confirmSignOut = false,
}) {
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
        setConfirmingSignOut(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return (
      <button
        type="button"
        onClick={onOpenAuth}
        className="flex items-center gap-2 bg-[#f26d70] hover:bg-[#ff7d80] text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-md shadow-[#ff777b]/20 transition-all active:scale-95"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>Sign In</span>
      </button>
    );
  }

  return (
    <div className={`relative ${open ? 'z-[100]' : ''}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setConfirmingSignOut(false);
        }}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2.5 rounded-xl border border-[#e7e8e3] bg-white p-1 pr-2.5 transition-all hover:border-[#d5d8ce] hover:bg-[#f7f8f4] dark:border-[#262c3c] dark:bg-[#181d28] dark:hover:border-[#32394c] dark:hover:bg-[#202737] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50"
      >
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${user.avatarColor || 'from-[#ff8586] to-[#d85e77]'} flex items-center justify-center text-xs font-bold text-white shadow-sm`}>
          {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div className="text-left hidden md:block">
          <span className="text-xs font-semibold text-[#34362f] dark:text-[#f3f4f6] block leading-tight max-w-[100px] truncate">
            {user.name}
          </span>
          <span className="text-[10px] text-[#85877f] dark:text-[#9ca3af] block leading-tight truncate max-w-[100px]">
            {user.title || (user.isGuest ? 'Guest' : 'Member')}
          </span>
        </div>
        <ChevronDown className={`w-3 h-3 text-[#85877f] dark:text-[#9ca3af] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute right-0 z-[110] mt-2 w-60 rounded-2xl border border-[#e7e8e3] bg-[#fffefa] p-1.5 text-[#34362f] shadow-[0_16px_40px_rgba(37,43,34,0.16)] dark:border-[#262c3c] dark:bg-[#161a25] dark:text-[#f3f4f6] dark:shadow-[0_16px_40px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 duration-100">
          <div className="mb-1.5 flex items-center gap-2.5 border-b border-[#ecece6] dark:border-[#222736] px-2.5 py-2.5">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr ${user.avatarColor || 'from-[#ff8586] to-[#d85e77]'} text-sm font-bold text-white shadow-sm`}>
              {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[#34362f] dark:text-[#f3f4f6]">{user.name}</p>
              <p className="truncate text-[10px] text-[#85877f] dark:text-[#9ca3af]">{user.email}</p>
            </div>
          </div>

          {confirmingSignOut ? (
            <div className="px-2 py-1">
              <p className="px-1 pb-2 text-[11px] leading-relaxed text-[#686b63] dark:text-[#9ca3af]">
                Leaving will end your current call and guest session.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingSignOut(false)}
                  className="flex-1 rounded-xl border border-[#e5e6df] bg-white px-2 py-2 text-[11px] font-semibold text-[#5e6058] transition-colors hover:bg-[#f4f5f1] dark:border-[#262c3c] dark:bg-[#1c212f] dark:text-[#c4c7d0] dark:hover:bg-[#232a3b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9bbc6d]/50"
                >
                  Stay in call
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setConfirmingSignOut(false);
                    onSignOut();
                  }}
                  className="flex-1 rounded-xl bg-[#d94d49] px-2 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#c9413e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d94d49]/50 focus-visible:ring-offset-2"
                >
                  Leave &amp; end
                </button>
              </div>
            </div>
          ) : (
            <>
              {canEditProfile && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); onOpenProfile(); }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-xs font-medium text-[#4f514a] transition-colors hover:bg-[#f1f4e9] dark:text-[#c4c7d0] dark:hover:bg-[#202636] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9bbc6d]/50"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff0e8] dark:bg-[#2d221c]">
                    <User className="h-3.5 w-3.5 text-[#d97868]" />
                  </span>
                  <span>{user.isGuest ? 'Edit display name' : 'Edit Profile'}</span>
                </button>
              )}

              {/* Theme Toggle within Dropdown Menu */}
              <div className="my-1 border-t border-[#ecece6] dark:border-[#222736]" />
              <ThemeToggle variant="menu" />
              <div className="my-1 border-t border-[#ecece6] dark:border-[#222736]" />

              <button
                type="button"
                onClick={() => {
                  if (confirmSignOut) {
                    setConfirmingSignOut(true);
                    return;
                  }
                  setOpen(false);
                  onSignOut();
                }}
                className="mt-0.5 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-xs font-medium text-[#bb514b] transition-colors hover:bg-[#fff0ed] dark:text-[#f87171] dark:hover:bg-[#2a1b1b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ee7569]/40"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff0ed] dark:bg-[#341b1b]">
                  <LogOut className="h-3.5 w-3.5" />
                </span>
                <span>{user.isGuest ? 'End guest session' : 'Sign Out'}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
