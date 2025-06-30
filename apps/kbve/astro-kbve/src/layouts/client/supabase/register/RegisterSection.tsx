import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface Stat {
  label: string;
  value: number;
  suffix: string;
  color: string;
}

interface Testimonial {
  id: number;
  name: string;
  role: string;
  avatar: string;
  content: string;
  rating: number;
}

const RegisterSection: React.FC = () => {
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const [stats, setStats] = useState<Stat[]>([
    { label: 'Active Users', value: 0, suffix: '+', color: 'from-cyan-400 to-blue-500' },
    { label: 'Projects Created', value: 0, suffix: '+', color: 'from-purple-400 to-pink-500' },
    { label: 'Games Developed', value: 0, suffix: '+', color: 'from-green-400 to-emerald-500' },
    { label: 'Community Score', value: 0, suffix: '%', color: 'from-orange-400 to-red-500' },
  ]);

  const testimonials: Testimonial[] = [
    {
      id: 1,
      name: 'Alex Chen',
      role: 'Indie Game Developer',
      avatar: '🎮',
      content: 'KBVE has revolutionized my development workflow. The community support is incredible!',
      rating: 5,
    },
    {
      id: 2,
      name: 'Sarah Kim',
      role: 'Full Stack Developer',
      avatar: '💻',
      content: 'The tools and resources available here have accelerated my learning curve tremendously.',
      rating: 5,
    },
    {
      id: 3,
      name: 'Mike Rodriguez',
      role: 'UI/UX Designer',
      avatar: '🎨',
      content: 'Amazing platform for collaboration. Found my dream team here!',
      rating: 5,
    },
  ];

  const targetStats = [
    { label: 'Active Users', value: 12547, suffix: '+', color: 'from-cyan-400 to-blue-500' },
    { label: 'Projects Created', value: 8932, suffix: '+', color: 'from-purple-400 to-pink-500' },
    { label: 'Games Developed', value: 2156, suffix: '+', color: 'from-green-400 to-emerald-500' },
    { label: 'Community Score', value: 98, suffix: '%', color: 'from-orange-400 to-red-500' },
  ];

  // Animate stats on mount
  useEffect(() => {
    const animateStats = () => {
      targetStats.forEach((targetStat, index) => {
        const duration = 2000; // 2 seconds
        const steps = 60;
        const increment = targetStat.value / steps;
        let currentValue = 0;

        const timer = setInterval(() => {
          currentValue += increment;
          if (currentValue >= targetStat.value) {
            currentValue = targetStat.value;
            clearInterval(timer);
          }

          setStats(prevStats => 
            prevStats.map((stat, i) => 
              i === index 
                ? { ...stat, value: Math.floor(currentValue) }
                : stat
            )
          );
        }, duration / steps);
      });
    };

    const timeoutId = setTimeout(animateStats, 500);
    return () => clearTimeout(timeoutId);
  }, []);

  // Auto-rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [testimonials.length]);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <span
        key={i}
        className={`text-lg ${
          i < rating ? 'text-yellow-400' : 'text-zinc-600'
        }`}
      >
        ⭐
      </span>
    ));
  };

  return (
    <section className="px-6 py-12 sm:px-8 lg:px-12" data-section="register-4">
      <div className="mx-auto max-w-7xl">
        {/* Community Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent">
              Join Our Growing Community
            </h2>
            <p className="text-lg text-zinc-300 max-w-2xl mx-auto">
              Thousands of developers, designers, and creators are already building amazing things with KBVE.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative group"
              >
                <div className="h-full rounded-2xl bg-zinc-800/90 backdrop-blur-md border border-zinc-700/50 p-6 text-center
                  shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_0_20px_rgba(0,0,0,0.2),0_10px_30px_rgba(0,0,0,0.3)]
                  hover:scale-105 transition-all duration-300 group-hover:border-cyan-500/30">
                  <div className={`text-3xl sm:text-4xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent mb-2`}>
                    {stat.value.toLocaleString()}{stat.suffix}
                  </div>
                  <div className="text-zinc-300 font-medium">
                    {stat.label}
                  </div>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Testimonials Carousel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mb-16"
        >
          <div className="text-center mb-8">
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              What Our Community Says
            </h3>
          </div>

          <div className="relative max-w-4xl mx-auto">
            <div className="rounded-2xl bg-zinc-800/90 backdrop-blur-md border border-zinc-700/50 p-8
              shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_0_20px_rgba(0,0,0,0.2),0_10px_30px_rgba(0,0,0,0.3)]
              min-h-[200px] relative overflow-hidden">
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTestimonial}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.5 }}
                  className="text-center"
                >
                  <div className="text-4xl mb-4">
                    {testimonials[currentTestimonial].avatar}
                  </div>
                  <p className="text-lg text-zinc-300 mb-6 leading-relaxed">
                    "{testimonials[currentTestimonial].content}"
                  </p>
                  <div className="flex justify-center mb-4">
                    {renderStars(testimonials[currentTestimonial].rating)}
                  </div>
                  <div className="text-white font-semibold">
                    {testimonials[currentTestimonial].name}
                  </div>
                  <div className="text-cyan-400 text-sm">
                    {testimonials[currentTestimonial].role}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Navigation Dots */}
              <div className="flex justify-center mt-8 space-x-2">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentTestimonial(index)}
                    className={`w-3 h-3 rounded-full transition-all duration-300 ${
                      index === currentTestimonial
                        ? 'bg-cyan-400 scale-125'
                        : 'bg-zinc-600 hover:bg-zinc-500'
                    }`}
                    aria-label={`Go to testimonial ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center"
        >
          <div className="rounded-2xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 p-8
            backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_30px_rgba(0,0,0,0.3)]">
            <h3 className="text-2xl font-bold text-white mb-4">
              Ready to Get Started?
            </h3>
            <p className="text-zinc-300 mb-6 max-w-2xl mx-auto">
              Join thousands of creators who are already building the future with KBVE. 
              Your journey starts with a single click.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const registerForm = document.querySelector('[data-skeleton="register"]')?.parentElement;
                if (registerForm) {
                  registerForm.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="inline-flex items-center px-8 py-4 text-lg font-semibold text-white
                bg-gradient-to-r from-cyan-500 to-purple-600 rounded-xl
                hover:from-cyan-600 hover:to-purple-700 transition-all duration-300
                shadow-[0_4px_15px_rgba(59,130,246,0.3)] hover:shadow-[0_6px_20px_rgba(59,130,246,0.4)]
                border border-cyan-400/20 hover:border-cyan-400/40"
            >
              <span>Start Your Journey</span>
              <svg
                className="ml-2 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default RegisterSection;