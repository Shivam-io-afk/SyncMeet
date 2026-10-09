import React, { useEffect, useState } from 'react';
import { User, Briefcase, Check, X, Palette } from 'lucide-react';
import { cryptoAuthService } from '../../services/cryptoAuthService';

export function UserProfileModal({ isOpen, user, onClose, onProfileUpdated }) {
  const [name, setName] = useState(user?.name || '');
  const [title, setTitle] = useState(user?.title || '');
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor || 'from-[#ff8586] to-[#d85e77]');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;
    setName(user.name || '');
    setTitle(user.title || '');
    setAvatarColor(user.avatarColor || 'from-[#ff8586] to-[#d85e77]');
    setSaved(false);
  }, [isOpen, user?.id]);

  if (!isOpen || !user) return null;

  const colorOptions = [
    { label: 'Coral / Rose', val: 'from-[#ff8586] to-[#d85e77]' },
    { label: 'Emerald / Teal', val: 'from-emerald-600 to-teal-500' },
    { label: 'Purple / Pink', val: 'from-purple-600 to-pink-500' },
    { label: 'Amber / Orange', val: 'from-amber-600 to-orange-500' },
    { label: 'Blue / Indigo', val: 'from-blue-600 to-indigo-500' },
  ];

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const updated = await cryptoAuthService.updateProfile({
      name: name.trim(),
      title: title.trim(),
      avatarColor,
    });

    if (!updated) return;
    onProfileUpdated(updated);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#20211e]/40 backdrop-blur-md animate-in fade-in duration-150 dark:bg-black/80">
      <div className="w-full max-w-md rounded-3xl border border-[#e8e9e2] bg-white p-6 md:p-8 text-[#34362f] shadow-2xl relative dark:border-[#222736] dark:bg-[#12151e] dark:text-[#f3f4f6]">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-[#777a72] hover:text-[#20211e] hover:bg-[#f1f2ec] transition-colors dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-full bg-gradient-to-tr ${avatarColor} p-0.5 mx-auto mb-3 shadow-xl flex items-center justify-center`}>
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-2xl font-bold text-[#292b25] dark:bg-[#181d28] dark:text-white">
              {name ? name.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>
          <h2 className="text-lg font-bold text-[#292b25] dark:text-white">{name || 'Your Profile'}</h2>
          <p className="text-xs text-[#777a72] dark:text-gray-400">{user.email}</p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#555850] mb-1 dark:text-gray-300">
              Display Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#92948d] absolute left-3.5 top-1/2 -translate-y-1/2 dark:text-gray-500" />
              <input
                type="text"
                value={name}
                required
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#fbfbf8] border border-[#e1e3dc] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#34362f] focus:outline-none focus:border-[#9bbc6d] dark:bg-[#181d28] dark:border-white/10 dark:text-white dark:focus:border-[#9bbc6d]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#555850] mb-1 dark:text-gray-300">
              {user.isGuest ? 'Description' : 'Role / Title'}
            </label>
            <div className="relative">
              <Briefcase className="w-4 h-4 text-[#92948d] absolute left-3.5 top-1/2 -translate-y-1/2 dark:text-gray-500" />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#fbfbf8] border border-[#e1e3dc] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#34362f] focus:outline-none focus:border-[#9bbc6d] dark:bg-[#181d28] dark:border-white/10 dark:text-white dark:focus:border-[#9bbc6d]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#555850] mb-1.5 flex items-center gap-1.5 dark:text-gray-300">
              <Palette className="w-3.5 h-3.5 text-[#ff8586]" />
              Avatar Gradient Theme
            </label>
            <div className="flex gap-2">
              {colorOptions.map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setAvatarColor(opt.val)}
                  className={`w-8 h-8 rounded-full bg-gradient-to-tr ${opt.val} transition-all ${
                    avatarColor === opt.val ? 'ring-2 ring-[#9bbc6d] scale-110 shadow-lg' : 'opacity-60 hover:opacity-100'
                  }`}
                  title={opt.label}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-[#171815] hover:bg-[#30322c] text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all text-xs active:scale-98 mt-2 dark:bg-[#9bbc6d] dark:text-[#12151e] dark:hover:bg-[#a9c97b]"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Profile Saved!</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
