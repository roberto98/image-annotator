/**
 * Minimal Browser Test Runner
 * 
 * A simple test framework for running unit tests in the browser.
 * No dependencies required - just include this script and your test files.
 * 
 * Usage:
 *   TestRunner.describe('Module Name', () => {
 *     TestRunner.it('should do something', () => {
 *       TestRunner.expect(actual).toBe(expected);
 *     });
 *   });
 * 
 * @module tests/test-runner
 */

const TestRunner = (() => {
    // Test state
    let currentSuite = null;
    const suites = [];
    const results = {
        total: 0,
        passed: 0,
        failed: 0,
        errors: []
    };
    
    /**
     * Define a test suite
     * @param {string} name - Suite name
     * @param {Function} fn - Suite function containing tests
     */
    function describe(name, fn) {
        currentSuite = { name, tests: [] };
        suites.push(currentSuite);
        fn();
        currentSuite = null;
    }
    
    /**
     * Define a test case
     * @param {string} name - Test name
     * @param {Function} fn - Test function
     */
    function it(name, fn) {
        if (!currentSuite) {
            throw new Error('it() must be called inside describe()');
        }
        currentSuite.tests.push({ name, fn });
    }
    
    /**
     * Create an assertion
     * @param {*} actual - Actual value
     * @returns {Object} Assertion object with matchers
     */
    function expect(actual) {
        return {
            toBe(expected) {
                if (actual !== expected) {
                    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
                }
            },
            
            toEqual(expected) {
                const actualStr = JSON.stringify(actual);
                const expectedStr = JSON.stringify(expected);
                if (actualStr !== expectedStr) {
                    throw new Error(`Expected ${expectedStr}, got ${actualStr}`);
                }
            },
            
            toBeCloseTo(expected, precision = 2) {
                const tolerance = Math.pow(10, -precision) / 2;
                if (Math.abs(actual - expected) > tolerance) {
                    throw new Error(`Expected ${expected} (within ${tolerance}), got ${actual}`);
                }
            },
            
            toBeTruthy() {
                if (!actual) {
                    throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
                }
            },
            
            toBeFalsy() {
                if (actual) {
                    throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
                }
            },
            
            toBeNull() {
                if (actual !== null) {
                    throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
                }
            },
            
            toBeDefined() {
                if (actual === undefined) {
                    throw new Error('Expected defined value, got undefined');
                }
            },
            
            toBeUndefined() {
                if (actual !== undefined) {
                    throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
                }
            },
            
            toBeGreaterThan(expected) {
                if (actual <= expected) {
                    throw new Error(`Expected ${actual} to be greater than ${expected}`);
                }
            },
            
            toBeLessThan(expected) {
                if (actual >= expected) {
                    throw new Error(`Expected ${actual} to be less than ${expected}`);
                }
            },
            
            toContain(expected) {
                if (Array.isArray(actual)) {
                    if (!actual.includes(expected)) {
                        throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
                    }
                } else if (typeof actual === 'string') {
                    if (!actual.includes(expected)) {
                        throw new Error(`Expected string to contain "${expected}"`);
                    }
                } else {
                    throw new Error('toContain() requires array or string');
                }
            },
            
            toThrow(expectedMessage) {
                let threw = false;
                let error = null;
                try {
                    actual();
                } catch (e) {
                    threw = true;
                    error = e;
                }
                if (!threw) {
                    throw new Error('Expected function to throw');
                }
                if (expectedMessage && !error.message.includes(expectedMessage)) {
                    throw new Error(`Expected error message to contain "${expectedMessage}", got "${error.message}"`);
                }
            },
            
            toHaveLength(expected) {
                if (!actual || actual.length !== expected) {
                    throw new Error(`Expected length ${expected}, got ${actual?.length}`);
                }
            }
        };
    }
    
    /**
     * Run all test suites
     * @returns {Object} Test results
     */
    function run() {
        results.total = 0;
        results.passed = 0;
        results.failed = 0;
        results.errors = [];
        
        console.log('\n========================================');
        console.log('      Running Tests');
        console.log('========================================\n');
        
        for (const suite of suites) {
            console.log(`\n[Suite] ${suite.name}`);
            console.log('-'.repeat(40));
            
            for (const test of suite.tests) {
                results.total++;
                try {
                    test.fn();
                    results.passed++;
                    console.log(`  ✓ ${test.name}`);
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        suite: suite.name,
                        test: test.name,
                        error: error.message
                    });
                    console.error(`  ✗ ${test.name}`);
                    console.error(`    Error: ${error.message}`);
                }
            }
        }
        
        console.log('\n========================================');
        console.log(`  Total: ${results.total}`);
        console.log(`  Passed: ${results.passed}`);
        console.log(`  Failed: ${results.failed}`);
        console.log('========================================\n');
        
        // Update DOM if test results element exists
        const resultsEl = document.getElementById('test-results');
        if (resultsEl) {
            resultsEl.innerHTML = formatResultsHTML();
        }
        
        return results;
    }
    
    /**
     * Format results as HTML
     * @returns {string} HTML string
     */
    function formatResultsHTML() {
        let html = '<h2>Test Results</h2>';
        html += `<p class="summary ${results.failed > 0 ? 'failed' : 'passed'}">`;
        html += `Total: ${results.total} | Passed: ${results.passed} | Failed: ${results.failed}`;
        html += '</p>';
        
        for (const suite of suites) {
            html += `<div class="suite"><h3>${suite.name}</h3><ul>`;
            for (const test of suite.tests) {
                const error = results.errors.find(e => e.suite === suite.name && e.test === test.name);
                if (error) {
                    html += `<li class="failed">✗ ${test.name}<br><small>${error.error}</small></li>`;
                } else {
                    html += `<li class="passed">✓ ${test.name}</li>`;
                }
            }
            html += '</ul></div>';
        }
        
        return html;
    }
    
    /**
     * Reset the test runner
     */
    function reset() {
        suites.length = 0;
        results.total = 0;
        results.passed = 0;
        results.failed = 0;
        results.errors = [];
    }
    
    // Public API
    return {
        describe,
        it,
        expect,
        run,
        reset,
        get results() { return { ...results }; }
    };
})();

// Export to window
if (typeof window !== 'undefined') {
    window.TestRunner = TestRunner;
}

console.log('[TestRunner] Minimal test runner loaded');
